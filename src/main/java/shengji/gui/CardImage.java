package shengji.gui;

import org.apache.log4j.Logger;
import shengji.logger.LogFactory;

import javax.swing.*;
import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;

public class CardImage extends ImageLabel {

    private static Logger log = LogFactory.getLog(CardImage.class);

    private static final int SELECTED = 1;
    private static final int NOT_SELECTED = 0;
    private static final int MOVE_DISTANCE = 20;

    private int mSelectStatus = NOT_SELECTED;

    public CardImage(JFrame frame, String filePath) {
        super(frame, filePath);
    }

    @Override
    public void setMouseEventListener() {
        this.addMouseListener(new MouseListener() {
            public void mouseClicked(MouseEvent e) {
                if (mSelectStatus == SELECTED) {
                    moveVertical(-MOVE_DISTANCE);
                    mSelectStatus = NOT_SELECTED;
                }
                else {
                    moveVertical(MOVE_DISTANCE);
                    mSelectStatus = SELECTED;
                }

                log.info("Card Toggled");
            }

            public void mousePressed(MouseEvent e) {}
            public void mouseReleased(MouseEvent e) {}
            public void mouseEntered(MouseEvent e) {}
            public void mouseExited(MouseEvent e) {}
        });
    }

    public void moveVertical(int distance) {
        this.setLocation(this.getX(), this.getY() + distance);
    }
}
