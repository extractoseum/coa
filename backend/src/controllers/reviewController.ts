import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { notifyNewReviewForApproval, notifyReviewApproved } from '../services/onesignalService';

// Get reviews for a COA (public)
export const getReviews = async (req: Request, res: Response) => {
    try {
        const { coaToken } = req.params;

        // Get COA ID from token
        const { data: coa } = await supabase
            .from('coas')
            .select('id, reviews_enabled')
            .eq('public_token', coaToken)
            .single();

        if (!coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        if (!coa.reviews_enabled) {
            return res.json({
                success: true,
                reviews: [],
                stats: null,
                reviewsEnabled: false
            });
        }

        // Get approved and visible reviews
        const { data: reviews, error } = await supabase
            .from('coa_reviews')
            .select(`
                id,
                rating,
                review_text,
                photo_url,
                created_at,
                clients (
                    id,
                    name,
                    email
                )
            `)
            .eq('coa_id', coa.id)
            .eq('is_approved', true)
            .eq('is_visible', true)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        // Get stats
        const { data: statsData } = await supabase
            .rpc('get_coa_review_stats', { p_coa_id: coa.id });

        const stats = statsData?.[0] || { avg_rating: null, review_count: 0 };

        // Format reviews to hide email
        const formattedReviews = (reviews || []).map((r: any) => ({
            id: r.id,
            rating: r.rating,
            review_text: r.review_text,
            photo_url: r.photo_url,
            created_at: r.created_at,
            author: r.clients?.name || r.clients?.email?.split('@')[0] || 'Usuario'
        }));

        res.json({
            success: true,
            reviews: formattedReviews,
            stats,
            reviewsEnabled: true
        });
    } catch (err) {
        console.error('Error fetching reviews:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Create a review (authenticated user)
export const createReview = async (req: Request, res: Response) => {
    try {
        const { coaToken } = req.params;
        const { rating, review_text, photo_url } = req.body;
        const clientId = (req as any).client?.id;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, error: 'Rating debe ser entre 1 y 5' });
        }

        // Get COA with owner info
        const { data: coa } = await supabase
            .from('coas')
            .select('id, reviews_enabled, reviews_require_approval, client_id, strain_name')
            .eq('public_token', coaToken)
            .single();

        if (!coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        if (!coa.reviews_enabled) {
            return res.status(400).json({ success: false, error: 'Las resenas estan deshabilitadas para este COA' });
        }

        // Check if user already reviewed
        const { data: existingReview } = await supabase
            .from('coa_reviews')
            .select('id')
            .eq('coa_id', coa.id)
            .eq('client_id', clientId)
            .single();

        if (existingReview) {
            return res.status(400).json({ success: false, error: 'Ya has dejado una resena para este producto' });
        }

        // Create review
        const { data: review, error } = await supabase
            .from('coa_reviews')
            .insert({
                coa_id: coa.id,
                client_id: clientId,
                rating,
                review_text: review_text?.trim() || null,
                photo_url: photo_url || null,
                is_approved: !coa.reviews_require_approval, // Auto-approve if not required
                is_visible: true
            })
            .select()
            .single();

        if (error) throw error;

        // Send notification to COA owner if review requires approval
        if (coa.reviews_require_approval && coa.client_id) {
            // Get reviewer name
            const { data: reviewer } = await supabase
                .from('clients')
                .select('name, email')
                .eq('id', clientId)
                .single();

            const reviewerName = reviewer?.name || reviewer?.email?.split('@')[0] || 'Un usuario';
            const coaName = coa.strain_name || 'tu producto';

            // Send push notification (non-blocking)
            notifyNewReviewForApproval(coa.client_id, coaName, reviewerName).catch(err => {
                console.error('Error sending review notification:', err);
            });
        }

        res.json({
            success: true,
            review,
            message: coa.reviews_require_approval
                ? 'Resena enviada, pendiente de aprobacion'
                : 'Resena publicada'
        });
    } catch (err) {
        console.error('Error creating review:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Update own review
export const updateReview = async (req: Request, res: Response) => {
    try {
        const { reviewId } = req.params;
        const { rating, review_text } = req.body;
        const clientId = (req as any).client?.id;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        // Check ownership
        const { data: review } = await supabase
            .from('coa_reviews')
            .select('id, client_id')
            .eq('id', reviewId)
            .single();

        if (!review) {
            return res.status(404).json({ success: false, error: 'Resena no encontrada' });
        }

        if (review.client_id !== clientId) {
            return res.status(403).json({ success: false, error: 'No puedes editar esta resena' });
        }

        const updateData: any = { updated_at: new Date().toISOString() };
        if (rating) updateData.rating = rating;
        if (review_text !== undefined) updateData.review_text = review_text?.trim() || null;

        const { error } = await supabase
            .from('coa_reviews')
            .update(updateData)
            .eq('id', reviewId);

        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating review:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Delete own review
export const deleteReview = async (req: Request, res: Response) => {
    try {
        const { reviewId } = req.params;
        const clientId = (req as any).client?.id;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        // Check ownership
        const { data: review } = await supabase
            .from('coa_reviews')
            .select('id, client_id')
            .eq('id', reviewId)
            .single();

        if (!review) {
            return res.status(404).json({ success: false, error: 'Resena no encontrada' });
        }

        if (review.client_id !== clientId) {
            return res.status(403).json({ success: false, error: 'No puedes eliminar esta resena' });
        }

        const { error } = await supabase
            .from('coa_reviews')
            .delete()
            .eq('id', reviewId);

        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting review:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Check if user has reviewed a COA
export const checkUserReview = async (req: Request, res: Response) => {
    try {
        const { coaToken } = req.params;
        const clientId = (req as any).client?.id;

        if (!clientId) {
            return res.json({ success: true, hasReviewed: false, review: null });
        }

        // Get COA ID
        const { data: coa } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', coaToken)
            .single();

        if (!coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        const { data: review } = await supabase
            .from('coa_reviews')
            .select('*')
            .eq('coa_id', coa.id)
            .eq('client_id', clientId)
            .single();

        res.json({
            success: true,
            hasReviewed: !!review,
            review
        });
    } catch (err) {
        console.error('Error checking user review:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ========== COA OWNER ENDPOINTS ==========

// Get pending reviews for COA owner
export const getPendingReviews = async (req: Request, res: Response) => {
    try {
        const { coaToken } = req.params;
        const clientId = (req as any).client?.id;

        // Verify ownership
        const { data: coa } = await supabase
            .from('coas')
            .select('id, client_id')
            .eq('public_token', coaToken)
            .single();

        if (!coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        if (coa.client_id !== clientId) {
            return res.status(403).json({ success: false, error: 'No eres dueno de este COA' });
        }

        const { data: reviews, error } = await supabase
            .from('coa_reviews')
            .select(`
                id,
                rating,
                review_text,
                created_at,
                is_approved,
                clients (
                    id,
                    name,
                    email
                )
            `)
            .eq('coa_id', coa.id)
            .eq('is_approved', false)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, reviews: reviews || [] });
    } catch (err) {
        console.error('Error fetching pending reviews:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Approve a review (COA owner)
export const approveReview = async (req: Request, res: Response) => {
    try {
        const { reviewId } = req.params;
        const clientId = (req as any).client?.id;

        // Get review and verify COA ownership
        const { data: review } = await supabase
            .from('coa_reviews')
            .select('id, coa_id, client_id')
            .eq('id', reviewId)
            .single();

        if (!review) {
            return res.status(404).json({ success: false, error: 'Resena no encontrada' });
        }

        const { data: coa } = await supabase
            .from('coas')
            .select('client_id, strain_name')
            .eq('id', review.coa_id)
            .single();

        if (coa?.client_id !== clientId) {
            return res.status(403).json({ success: false, error: 'No eres dueno de este COA' });
        }

        const { error } = await supabase
            .from('coa_reviews')
            .update({ is_approved: true })
            .eq('id', reviewId);

        if (error) throw error;

        // Notify the reviewer that their review was approved
        if (review.client_id) {
            const coaName = coa?.strain_name || 'el producto';
            notifyReviewApproved(review.client_id, coaName).catch(err => {
                console.error('Error sending review approved notification:', err);
            });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error approving review:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Reject/delete a review (COA owner)
export const rejectReview = async (req: Request, res: Response) => {
    try {
        const { reviewId } = req.params;
        const clientId = (req as any).client?.id;

        // Get review and verify COA ownership
        const { data: review } = await supabase
            .from('coa_reviews')
            .select('id, coa_id')
            .eq('id', reviewId)
            .single();

        if (!review) {
            return res.status(404).json({ success: false, error: 'Resena no encontrada' });
        }

        const { data: coa } = await supabase
            .from('coas')
            .select('client_id')
            .eq('id', review.coa_id)
            .single();

        if (coa?.client_id !== clientId) {
            return res.status(403).json({ success: false, error: 'No eres dueno de este COA' });
        }

        const { error } = await supabase
            .from('coa_reviews')
            .delete()
            .eq('id', reviewId);

        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        console.error('Error rejecting review:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Update review settings for a COA
export const updateReviewSettings = async (req: Request, res: Response) => {
    try {
        const { coaToken } = req.params;
        const { reviews_enabled, reviews_require_approval } = req.body;
        const clientId = (req as any).client?.id;

        // Verify ownership or super_admin
        const { data: coa } = await supabase
            .from('coas')
            .select('id, client_id')
            .eq('public_token', coaToken)
            .single();

        if (!coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        // Check if owner or super admin
        const { data: client } = await supabase
            .from('clients')
            .select('role, tags')
            .eq('id', clientId)
            .single();

        const isSuperAdmin = client?.role === 'super_admin' ||
            (Array.isArray(client?.tags) && client.tags.includes('super_admin'));

        if (coa.client_id !== clientId && !isSuperAdmin) {
            return res.status(403).json({ success: false, error: 'No tienes permiso para modificar este COA' });
        }

        const updateData: any = {};
        if (reviews_enabled !== undefined) updateData.reviews_enabled = reviews_enabled;
        if (reviews_require_approval !== undefined) updateData.reviews_require_approval = reviews_require_approval;

        const { error } = await supabase
            .from('coas')
            .update(updateData)
            .eq('id', coa.id);

        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating review settings:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};
